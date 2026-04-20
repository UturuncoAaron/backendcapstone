import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity.js';
import { ParentPortalController } from './parent-portal.controller.js';
import { ParentPortalService } from './parent-portal.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([User])],
    controllers: [ParentPortalController],
    providers: [ParentPortalService],
})
export class ParentPortalModule { }