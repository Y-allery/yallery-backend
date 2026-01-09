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
      // Firebase notification sent successfully
      return { success: true, response };
    } catch (error) {
      console.error(`❌ Firebase notification failed for token: ${token.substring(0, 10)}...`, error.message);
      
      // Перевіряємо, чи токен невалідний
      const errorCode = error.code || '';
      const errorMessage = error.message || '';
      const isInvalidToken = 
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token' ||
        errorMessage.includes('Requested entity was not found') ||
        errorMessage.includes('UNREGISTERED') ||
        errorMessage.includes('registration-token-not-registered') ||
        errorMessage.includes('invalid-registration-token');
      
      return { 
        success: false, 
        error,
        isInvalidToken,
      };
    }
  }
}
