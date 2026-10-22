// Real profile/password smoke test. Temporary account and all changes roll back.
const fs=require('node:fs');const assert=require('node:assert/strict');const crypto=require('node:crypto');const bcrypt=require('bcrypt');
const {DataSource,IsNull}=require('typeorm');const {User}=require('../dist/src/user/entities/user.entity');
const {PasswordResetToken}=require('../dist/src/auth/entities/password-reset-token.entity');const {ProfileService}=require('../dist/src/auth/profile.service');
const env=require('dotenv').parse(fs.readFileSync('.env'));
(async()=>{
 const db=new DataSource({type:'postgres',host:env.DB_HOST,port:Number(env.DB_PORT),username:env.DB_USERNAME,password:env.DB_PASSWORD,database:env.DB_DATABASE,entities:[__dirname+'/../dist/**/*.entity.js'],synchronize:false,migrationsRun:false,logging:false});let runner;
 try{
  await db.initialize();runner=db.createQueryRunner();await runner.connect();await runner.startTransaction();
  const suffix=crypto.randomBytes(8).toString('hex');const currentPassword='CurrentTest123!';const password='NewTest123!';
  const initial={idCard:'test-'+suffix,name:'ProfileTest',surname1:'Temporary',surname2:'',email:suffix+'@example.invalid',phoneNumber:'88888888',birthdate:new Date('2000-01-01')};
  const user=await runner.manager.save(User,{...initial,password:await bcrypt.hash(currentPassword,10),isActive:true,sessionVersion:0});
  await runner.manager.save(PasswordResetToken,{userId:user.id,tokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+60000)});
  const wrapped={query:(...args)=>runner.query(...args),getRepository:entity=>runner.manager.getRepository(entity),transaction:async fn=>{await runner.startTransaction();try{const result=await fn(runner.manager);await runner.commitTransaction();return result;}catch(e){await runner.rollbackTransaction();throw e;}}};
  const service=new ProfileService(wrapped);
  const before=await service.get(user.id);assert.equal(before.idCard,initial.idCard);assert(!('password' in before));assert(!('sessionVersion' in before));
  assert.equal(before.countryCode,null);assert.equal(before.preferredCurrency,null);assert.equal(before.resolvedCurrency,'CRC');assert.equal(before.currencySource,'default');
  const update={name:'Updated',surname1:initial.surname1,surname2:'Second',email:initial.email,phoneNumber:'99999999',birthdate:initial.birthdate};
  const edited=await service.update(user.id,update);assert.equal(edited.name,'Updated');assert.equal(edited.phoneNumber,'99999999');assert.equal(edited.idCard,initial.idCard);
  const explicit=await service.update(user.id,{...update,countryCode:'CR',preferredCurrency:'USD'});assert.equal(explicit.resolvedCurrency,'USD');assert.equal(explicit.currencySource,'preference');
  const moved=await service.update(user.id,{...update,countryCode:'ES'});assert.equal(moved.preferredCurrency,'USD');assert.equal(moved.resolvedCurrency,'USD');
  const automatic=await service.update(user.id,{...update,preferredCurrency:null});assert.equal(automatic.resolvedCurrency,'EUR');assert.equal(automatic.currencySource,'country');
  const cleared=await service.update(user.id,{...update,countryCode:null});assert.equal(cleared.resolvedCurrency,'CRC');assert.equal(cleared.currencySource,'default');
  await assert.rejects(()=>service.update(user.id,{...update,email:'changed-'+suffix+'@example.invalid'}),e=>e.getStatus?.()===400);
  const confirmed=await service.update(user.id,{...update,email:'changed-'+suffix+'@example.invalid',currentPassword});assert.equal(confirmed.email,'changed-'+suffix+'@example.invalid');
  await assert.rejects(()=>service.changePassword(user.id,{currentPassword:'wrong',password}),e=>e.getStatus?.()===400);
  await service.changePassword(user.id,{currentPassword,password});
  const stored=await runner.manager.getRepository(User).createQueryBuilder('user').addSelect('user.password').addSelect('user.sessionVersion').where('user.id=:id',{id:user.id}).getOne();
  assert.equal(await bcrypt.compare(password,stored.password),true);assert.equal(await bcrypt.compare(currentPassword,stored.password),false);assert.equal(stored.sessionVersion,1);
  assert.equal(await runner.manager.countBy(PasswordResetToken,{userId:user.id,usedAt:IsNull()}),0);
  console.log('PostgreSQL real: país/moneda persistidos, preferencia conservada al cambiar país, retorno a automático/CRC, vista segura y controles de correo/contraseña/sesiones: correcto.');
 }catch(e){console.log('Prueba de perfil falló: '+(e.code??e.name??'error'));process.exitCode=1;}
 finally{if(runner){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();console.log('Cuenta temporal y cambios revertidos; no se modificaron cuentas existentes.');}if(db.isInitialized)await db.destroy();}
})();
