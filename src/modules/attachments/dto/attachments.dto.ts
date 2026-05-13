import { IsIn, IsUUID } from 'class-validator';
import { ATTACHMENT_OWNER_TYPES } from '../entities/attachment.entity.js';
import type { AttachmentOwnerType } from '../entities/attachment.entity.js';

export class UploadAttachmentDto {
    @IsIn(ATTACHMENT_OWNER_TYPES as unknown as string[])
    owner_type: AttachmentOwnerType;

    @IsUUID()
    owner_id: string;
}

export class ListAttachmentsQueryDto {
    @IsIn(ATTACHMENT_OWNER_TYPES as unknown as string[])
    owner_type: AttachmentOwnerType;

    @IsUUID()
    owner_id: string;
}
