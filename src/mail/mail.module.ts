import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { SesMailer } from '../commons/clients/ses.client';

@Module({
  providers: [MailService, SesMailer],
  exports: [MailService],
})
export class MailModule {}
