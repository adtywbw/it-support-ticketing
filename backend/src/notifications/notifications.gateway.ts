import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { OnEvent } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import { Injectable } from "@nestjs/common";
import { UserRepository } from "../common/repositories/user.repository";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { getCorsOrigins } from "../common/utils/env-validation.util";

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: getCorsOrigins(), credentials: true },
  namespace: "/notifications",
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private userSockets: Map<string, Set<string>> = new Map();
  private expiryTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly allowedOrigins: ReadonlySet<string>;

  // Max simultaneous WebSocket connections per user to prevent resource exhaustion
  private static readonly MAX_CONNECTIONS_PER_USER = 5;

  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {
    this.allowedOrigins = new Set(getCorsOrigins());
  }

  async handleConnection(client: Socket) {
    // Validate the Origin header against allowed CORS origins.
    // This adds defense-in-depth alongside the @WebSocketGateway cors config.
    const origin = client.handshake.headers.origin;
    if (origin) {
      const allowed = this.allowedOrigins;
      if (allowed.size > 0 && !allowed.has(origin)) {
        client.disconnect();
        return;
      }
    }

    const token = client.handshake.auth?.token;

    if (typeof token !== "string" || !token.trim()) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET!,
        algorithms: ["HS256"],
      });

      if (payload.tokenType !== "access") {
        client.disconnect();
        return;
      }

      const userId = payload.sub;

      const user = await this.userRepository.getForValidation(userId);
      if (!user?.isActive) {
        client.disconnect();
        return;
      }

      // Enforce per-user connection limit to prevent resource exhaustion
      const existing = this.userSockets.get(userId);
      if (
        existing &&
        existing.size >= NotificationsGateway.MAX_CONNECTIONS_PER_USER
      ) {
        client.disconnect();
        return;
      }

      if (!existing) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);

      this.scheduleExpiryDisconnect(client, payload.exp);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiryTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(client.id);
    }

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

  private scheduleExpiryDisconnect(client: Socket, exp?: number) {
    if (!exp) return;

    const delayMs = exp * 1000 - Date.now();
    if (delayMs <= 0) {
      client.disconnect();
      return;
    }

    // Node.js setTimeout accepts up to 2^31-1 ms (~24.85 days); values
    // beyond that overflow and fire immediately. Cap to prevent premature
    // disconnect for tokens with very long expiry.
    const MAX_SETTIMEOUT_DELAY = 2_147_483_647;
    const safeDelay = Math.min(delayMs, MAX_SETTIMEOUT_DELAY);

    const timer = setTimeout(() => {
      // Guard: only disconnect if this socket's timer is still tracked.
      // Prevents a stale timer from disconnecting a new socket that reused
      // the same client.id (theoretical, as Socket.IO regenerates IDs).
      if (this.expiryTimers.has(client.id)) {
        this.expiryTimers.delete(client.id);
        client.disconnect();
      }
    }, safeDelay);

    this.expiryTimers.set(client.id, timer);
  }

  @OnEvent("notification.created")
  handleNotification(notification: NotificationPayload) {
    this.server
      .to(`user:${notification.userId}`)
      .emit("notification", notification);
  }

  @OnEvent("user.deactivated")
  handleUserDeactivated(payload: { userId: string }) {
    this.disconnectUserSockets(payload.userId);
  }

  @OnEvent("user.deleted")
  handleUserDeleted(payload: { userId: string }) {
    this.disconnectUserSockets(payload.userId);
  }

  private disconnectUserSockets(userId: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    for (const socketId of sockets) {
      const timer = this.expiryTimers.get(socketId);
      if (timer) {
        clearTimeout(timer);
        this.expiryTimers.delete(socketId);
      }
      const socket = this.server.sockets.sockets.get(socketId);
      socket?.leave(`user:${userId}`);
      socket?.disconnect(true);
    }
    this.userSockets.delete(userId);
  }
}
