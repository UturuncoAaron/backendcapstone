import { Module } from '@nestjs/common';
import { ParentPortalController } from './parent-portal.controller.js';
import { ParentPortalService } from './parent-portal.service.js';

@Module({
    controllers: [ParentPortalController],
    providers: [ParentPortalService],
})
export class ParentPortalModule { }