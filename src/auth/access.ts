import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export enum AppRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  OWNER = 'OWNER',
}

export const PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const Roles = (...roles: AppRole[]) =>
  SetMetadata(ROLES_KEY, roles);

export type AuthRequest = Request & {
  user: {
    id: number;
    roles: string[];
  };
};