import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsListener } from './notifications.listener.js';
import { NotificationsSchemaSync } from './notifications.schema-sync.js';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
    NotificationsSchemaSync,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
