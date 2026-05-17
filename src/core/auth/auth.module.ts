import { Module } from '@nestjs/common';
import { JwtMiddleware } from './jwt.middleware';

@Module({
  providers: [JwtMiddleware],
  exports: [JwtMiddleware],
})
export class AuthModule {}
