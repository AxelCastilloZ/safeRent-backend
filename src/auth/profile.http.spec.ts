import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { UserService } from '../user/user.service';

jest.mock('./auth.service', () => ({ AuthService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../user/user.service', () => ({ UserService: class {} }));

const validProfile = { name: 'José', surname1: 'Pérez', surname2: '', email: 'jose@example.com', phoneNumber: '88888888', birthdate: '2000-01-01' };
describe('Authenticated profile HTTP contract', () => {
  let app: INestApplication;
  const profile = { get: jest.fn(), update: jest.fn(), changePassword: jest.fn(), updateLanguage: jest.fn(), updateCurrency: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    profile.get.mockResolvedValue({ id: 7, ...validProfile });
    profile.update.mockResolvedValue({ id: 7, ...validProfile });
    profile.changePassword.mockResolvedValue({ message: 'Contraseña actualizada.' });
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [
      { provide: AuthService, useValue: {} }, { provide: PasswordRecoveryService, useValue: {} },
      { provide: ProfileService, useValue: profile },
      { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 7, sv: 0 }) } },
      { provide: UserService, useValue: { findForAuth: async () => ({ id: 7, name: 'José', surname1: 'Pérez', email: 'jose@example.com', sessionVersion: 0, Roles: [{ name: 'CLIENT', isActive: true }] }) } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('does not expose profile photo upload or deletion routes', async () => {
    await request(app.getHttpServer() as Server).post('/auth/profile/photo').set('Authorization', 'Bearer test').expect(404);
    await request(app.getHttpServer() as Server).delete('/auth/profile/photo').set('Authorization', 'Bearer test').expect(404);
  });
  it('requires authentication to view the profile', async () => {
    await request(app.getHttpServer() as Server).get('/auth/profile').expect(401);
    expect(profile.get).not.toHaveBeenCalled();
  });
  it('requires authentication to change the language', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/language').send({ preferredLanguage: 'fr' }).expect(401);
    expect(profile.updateLanguage).not.toHaveBeenCalled();
  });
  it('exposes only the currency catalog without authentication', async () => {
    const response = await request(app.getHttpServer() as Server).get('/auth/display-currencies').expect(200);
    expect(response.body.currencies).toEqual(expect.arrayContaining([{ code: 'USD', name: expect.any(String) }]));
    expect(response.body).not.toHaveProperty('countries');
  });
  it('requires authentication to change the currency', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/currency').send({ preferredCurrency: 'USD' }).expect(401);
    expect(profile.updateCurrency).not.toHaveBeenCalled();
  });
  it('takes the currency account from the token and strips injected fields', async () => {
    profile.updateCurrency.mockResolvedValue({ preferredCurrency: 'USD' });
    await request(app.getHttpServer() as Server).patch('/auth/currency').set('Authorization', 'Bearer test')
      .send({ preferredCurrency: 'USD', id: 99, roles: ['ADMIN'] }).expect(200);
    expect(profile.updateCurrency).toHaveBeenCalledWith(7, 'USD');
  });
  it.each(['BTC', '', null, 1, undefined])('rejects invalid currency %j', async preferredCurrency => {
    await request(app.getHttpServer() as Server).patch('/auth/currency').set('Authorization', 'Bearer test')
      .send({ preferredCurrency }).expect(400);
    expect(profile.updateCurrency).not.toHaveBeenCalled();
  });
  it.each(['es', 'en', 'fr', 'pt'])('saves language %s only for the authenticated identity', async (preferredLanguage) => {
    profile.updateLanguage.mockResolvedValue({ preferredLanguage });
    await request(app.getHttpServer() as Server).patch('/auth/language').set('Authorization', 'Bearer test')
      .send({ preferredLanguage, id: 99, roles: ['ADMIN'] }).expect(200, { preferredLanguage });
    expect(profile.updateLanguage).toHaveBeenCalledWith(7, preferredLanguage);
  });
  it.each(['de', 'pt-BR', '', null, ['en'], 1, undefined])('rejects invalid language %j', async (preferredLanguage) => {
    await request(app.getHttpServer() as Server).patch('/auth/language').set('Authorization', 'Bearer test').send({ preferredLanguage }).expect(400);
    expect(profile.updateLanguage).not.toHaveBeenCalled();
  });
  it('reads only the authenticated identity', async () => {
    await request(app.getHttpServer() as Server).get('/auth/profile?id=99').set('Authorization', 'Bearer test').expect(200);
    expect(profile.get).toHaveBeenCalledWith(7);
  });
  it('protects the country/currency catalog with authentication', async () => {
    await request(app.getHttpServer() as Server).get('/auth/profile-options').expect(401);
    const response = await request(app.getHttpServer() as Server).get('/auth/profile-options').set('Authorization', 'Bearer test').expect(200);
    expect(response.body.countries).toContainEqual({ code: 'CR', name: 'Costa Rica', currency: 'CRC' });
  });
  it('accepts normalized country/currency codes and strips derived currency injection', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, countryCode: ' cr ', preferredCurrency: ' usd ', resolvedCurrency: 'BTC', currencySource: 'preference' }).expect(200);
    const [, dto] = profile.update.mock.calls[0];
    expect(dto.countryCode).toBe('CR'); expect(dto.preferredCurrency).toBe('USD');
    expect(dto.resolvedCurrency).toBeUndefined(); expect(dto.currencySource).toBeUndefined();
  });
  it.each([{ countryCode: 'ZZ' }, { countryCode: '' }, { preferredCurrency: 'BTC' }, { preferredCurrency: 'XAU' }, { preferredCurrency: ['USD'] }])('rejects invalid preferences %j', async (preferences) => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, ...preferences }).expect(400);
    expect(profile.update).not.toHaveBeenCalled();
  });
  it('accepts null to restore automatic currency and clear the country', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, countryCode: null, preferredCurrency: null }).expect(200);
    expect(profile.update.mock.calls[0][1]).toMatchObject({ countryCode: null, preferredCurrency: null });
  });
  it('ignores identity, credentials and role injection in profile updates', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, id: 99, idCard: 'changed', roleId: 1, isActive: false, password: 'Injected123!' }).expect(200);
    const [id, dto] = profile.update.mock.calls[0];
    expect(id).toBe(7);
    for (const field of ['id', 'idCard', 'roleId', 'isActive', 'password']) expect(dto[field]).toBeUndefined();
    expect(dto.birthdate).toBeInstanceOf(Date);
  });
  it('rejects whitespace-only names', async () => {
    await request(app.getHttpServer() as Server).patch('/auth/profile').set('Authorization', 'Bearer test').send({ ...validProfile, name: '  ' }).expect(400);
    expect(profile.update).not.toHaveBeenCalled();
  });
  it('validates strong passwords on the protected change endpoint', async () => {
    await request(app.getHttpServer() as Server).post('/auth/change-password').set('Authorization', 'Bearer test').send({ currentPassword: 'Old123!', password: 'weak' }).expect(400);
    expect(profile.changePassword).not.toHaveBeenCalled();
  });
  it('passes only current and new password using authenticated identity', async () => {
    await request(app.getHttpServer() as Server).post('/auth/change-password').set('Authorization', 'Bearer test').send({ currentPassword: 'Old123!', password: 'NewPass123!', confirmPassword: 'NewPass123!', id: 99 }).expect(200);
    expect(profile.changePassword).toHaveBeenCalledWith(7, expect.objectContaining({ currentPassword: 'Old123!', password: 'NewPass123!' }));
    expect(profile.changePassword.mock.calls[0][1].id).toBeUndefined();
  });
});
