import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (sesClient) return sesClient;
  const endpoint = process.env['AWS_SES_ENDPOINT'] ?? process.env['AWS_ENDPOINT_URL'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  sesClient = new SESClient(endpoint ? { endpoint, region } : { region });
  return sesClient;
}

export interface SendEmailParams {
  to: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export class SesMailer {
  private readonly client = getSesClient();
  private readonly fromAddress = process.env['SES_FROM_ADDRESS'] ?? '';

  async send(params: SendEmailParams): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [params.to] },
        Message: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: params.htmlBody, Charset: 'UTF-8' },
            Text: { Data: params.textBody, Charset: 'UTF-8' },
          },
        },
        Source: this.fromAddress,
      }),
    );
  }
}
