import { Module } from '@nestjs/common';
import { JwtMiddleware } from './jwt.middleware.js';

@Module({
  providers: [JwtMiddleware],
  exports: [JwtMiddleware],
})
export class AuthModule {}
