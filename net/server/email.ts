import {
  SendEmailCommand,
  SendEmailCommandInput,
  SESv2Client,
} from 'npm:@aws-sdk/client-sesv2';
import { ServerServices } from './server.ts';
import { BaseService } from './service.ts';
import { EmailType } from '../../logging/metrics.ts';
import { isDevelopmentBuild } from '../../base/development.ts';

export interface EmailMessage {
  type: EmailType;
  to: string | string[];
  subject: string;
  plaintext: string;
  html: string;
}

export class EmailService extends BaseService<ServerServices> {
  private _client: SESv2Client;

  constructor(region: string) {
    super();
    this._client = new SESv2Client({ region });
  }

  async send(message: EmailMessage): Promise<boolean> {
    // Disable email sending on development machines
    if (isDevelopmentBuild()) {
      return false;
    }
    try {
      const success = await sendEmail(message, this._client);
      if (success) {
        this.services.logger.log({
          severity: 'METRIC',
          name: 'EmailSent',
          value: 1,
          unit: 'Count',
          type: message.type,
        });
      } else {
        console.error('Failed sending email');
      }
      return success;
    } catch (err: unknown) {
      console.error('Failed sending email:' + err);
      console.error('Trace:' + (err as Error).stack);
      return false;
    }
  }
}

export async function sendEmail(
  message: EmailMessage,
  client?: SESv2Client,
): Promise<boolean> {
  if (!client) {
    client = new SESv2Client({ region: 'us-east-1' });
  }
  if (!(message.to instanceof Array)) {
    message.to = [message.to];
  }
  const req: SendEmailCommandInput = {
    FromEmailAddress: '"Ovvio" <system@ovvio.io>',
    Destination: {
      ToAddresses: message.to,
    },
    Content: {
      Simple: {
        Subject: {
          Data: message.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: message.plaintext,
            Charset: 'UTF-8',
          },
          Html: {
            Data: message.html,
            Charset: 'UTF-8',
          },
        },
      },
    },
  };
  const resp = await client.send(new SendEmailCommand(req));
  debugger;
  return resp.MessageId !== undefined;
}
