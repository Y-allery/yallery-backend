import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private firebaseApp: admin.app.App;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.configService
          .get<string>('FIREBASE_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n'),
      }),
    });
  }

  async sendNotification(token: string, title: string, body: string) {
    const message = {
      notification: {
        title,
        body,
      },
      token,
    };
    try {
      const response = await this.firebaseApp.messaging().send(message);
      console.log(`✅ Firebase notification sent successfully to token: ${token.substring(0, 10)}...`);
      return { success: true, response };
    } catch (error) {
      console.error(`❌ Firebase notification failed for token: ${token.substring(0, 10)}...`, error.message);
      return { success: false, error };
    }
  }
}
