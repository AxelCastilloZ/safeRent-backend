// Real PostgreSQL smoke test. All writes use one outer transaction which is rolled back.
// No application boot/synchronize, no Brevo requests and no existing accounts are changed.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const { User } = require('../dist/src/user/entities/user.entity');
const { PasswordResetToken } = require('../dist/src/auth/entities/password-reset-token.entity');
const { PasswordRecoveryService } = require('../dist/src/auth/password-recovery.service');
const env = require('dotenv').parse(fs.readFileSync('.env'));
(async () => {
 const db = new DataSource({type:'postgres',host:env.DB_HOST,port:Number(env.DB_PORT),username:env.DB_USERNAME,password:env.DB_PASSWORD,database:env.DB_DATABASE,entities:[__dirname+'/../dist/**/*.entity.js'],synchronize:false,migrationsRun:false,logging:false});
 let runner;
 try {
  await db.initialize(); runner=db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  const suffix=crypto.randomBytes(8).toString('hex');
  const oldPassword='OldTest123!'; const newPassword='NewTest123!';
  const user=await runner.manager.save(User,{idCard:'test-'+suffix,name:'RecoveryTest',surname1:'Temporary',email:suffix+'@example.invalid',phoneNumber:'88888888',birthdate:new Date('2000-01-01'),password:await bcrypt.hash(oldPassword,10),isActive:true,sessionVersion:0});
  const token=crypto.randomBytes(32).toString('base64url');
  const otherToken=crypto.randomBytes(32).toString('base64url');
  for (const raw of [token,otherToken]) await runner.manager.save(PasswordResetToken,{userId:user.id,tokenHash:crypto.createHash('sha256').update(raw).digest('hex'),expiresAt:new Date(Date.now()+60000)});
  const transactionalDb={transaction:async callback=>{await runner.startTransaction();try{const result=await callback(runner.manager);await runner.commitTransaction();return result;}catch(e){await runner.rollbackTransaction();throw e;}}};
  const service=new PasswordRecoveryService(transactionalDb,new ConfigService(env),{ttlMinutes:15,sendPasswordReset:()=>{throw new Error('Email is disabled during DB test');}});
  const result=await service.reset({token,password:newPassword},'test-'+suffix);
  assert.equal(result.message,'Contraseña actualizada correctamente.');
  const changed=await runner.manager.getRepository(User).createQueryBuilder('user').addSelect('user.password').addSelect('user.sessionVersion').addSelect('user.passwordChangedAt').where('user.id = :id',{id:user.id}).getOne();
  assert.equal(await bcrypt.compare(newPassword,changed.password),true);
  assert.equal(await bcrypt.compare(oldPassword,changed.password),false);
  assert.equal(changed.sessionVersion,1); assert(changed.passwordChangedAt);
  for (const raw of [token,otherToken]) await assert.rejects(()=>service.reset({token:raw,password:oldPassword},'test-'+suffix),e=>e.getStatus?.()===400);
  console.log('PostgreSQL real: cambio bcrypt, contraseña anterior rechazada, versión de sesión incrementada, token usado rechazado y otros enlaces revocados: correcto.');
 } catch(e) {console.log('Prueba PostgreSQL falló: '+(e.code??e.name??'error'));process.exitCode=1;}
 finally {if(runner){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();console.log('Transacción de prueba revertida; sin cambios persistentes en cuentas.');}if(db.isInitialized)await db.destroy();}
})();

