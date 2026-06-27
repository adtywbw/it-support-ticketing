import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { UserRepository } from '../common/repositories/user.repository';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

const WS_CORS_ORIGIN = (process.env.CORS_ORIGIN || 'https://helpdesk.rsmch.internal')
  .split(',')
  .map((o) => o.trim());

@Injectable()
@WebSocketGateway({
  cors: { origin: WS_CORS_ORIGIN, credentials: true },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (typeof token !== 'string' || !token.trim()) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if (payload.tokenType && payload.tokenType !== 'access') {
        client.disconnect();
        return;
      }

      const userId = payload.sub;

      const user = await this.userRepository.getForValidation(userId);
      if (!user?.isActive) {
        client.disconnect();
        return;
      }

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }

  @OnEvent('notification.created')
  handleNotification(notification: NotificationPayload) {
    this.server
      .to(`user:${notification.userId}`)
      .emit('notification', notification);
  }

  @OnEvent('user.deactivated')
  handleUserDeactivated(payload: { userId: string }) {
    const sockets = this.userSockets.get(payload.userId);
    if (!sockets) return;

    for (const socketId of sockets) {
      const socket = this.server.sockets.sockets.get(socketId);
      socket?.leave(`user:${payload.userId}`);
      socket?.disconnect(true);
    }
    this.userSockets.delete(payload.userId);
  }
}
