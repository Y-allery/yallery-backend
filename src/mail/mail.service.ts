import { Injectable } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class MailService {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async sendResetPasswordEmail(to: string, resetUrl: string) {
    const msg = {
      to,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'Yallery team' },
      subject: 'Password Reset',
      text: `To reset your password, click the following link: ${resetUrl}`,
      html: `<p>To reset your password, click the following link: <a href="${resetUrl}">${resetUrl}</a></p>`,
    };
    await sgMail.send(msg);
  }

  async sendGenericEmail(to: string, subject: string, contentUrl: string) {
    const msg = {
      to,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'Yallery team' },
      subject,
      name: 'Yallery team',
      text: `Please click the following link: ${contentUrl}`,
      html: `<p>Please click the following link: <a href="${contentUrl}">${contentUrl}</a></p>`,
    };
    await sgMail.send(msg);
  }

  async sendEmailVerify(to: string, subject: string, contentUrl: string) {
    const msg = {
      to,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'Yallery team' },
      subject,
      name: 'Yallery team',
      text: `Please click the following link: ${contentUrl}`,
      html: `<p>Please click the following link: <a href="${contentUrl}">${contentUrl}</a></p>`,
    };
    await sgMail.send(msg);
  }
}
