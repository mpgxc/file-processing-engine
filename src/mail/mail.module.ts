import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { SesMailer } from '../shared/clients/ses.client.js';

@Module({
  providers: [MailService, SesMailer],
  exports: [MailService],
})
export class MailModule {}
