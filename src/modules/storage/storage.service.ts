import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor() {
    this.bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    folder: string,
  ): Promise<string> {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const key = `${folder}/${randomUUID()}${ext ? '.' + ext : ''}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      this.logger.verbose(`Subido: ${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Error al subir archivo: ${(error as Error).message}`);
      throw new InternalServerErrorException('Error al subir el archivo');
    }
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.s3, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Error al generar URL firmada: ${(error as Error).message}`);
      throw new InternalServerErrorException('Error al generar URL de descarga');
    }
  }

  async getDownloadUrl(key: string, filename: string, expiresIn = 3600): Promise<string> {
    try {
      const safeName = filename.replace(/"/g, '').replace(/[\r\n]/g, ' ');
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition:
          `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      });
      return await getSignedUrl(this.s3, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Error al generar URL de descarga: ${(error as Error).message}`);
      throw new InternalServerErrorException('Error al generar URL de descarga');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      this.logger.verbose(`Eliminado: ${key}`);
    } catch (error) {
      this.logger.error(`Error al eliminar archivo: ${(error as Error).message}`);
      throw new InternalServerErrorException('Error al eliminar el archivo');
    }
  }

  getPublicUrl(key: string): string {
    const domain = process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN!.replace(/\/$/, '');
    return `${domain}/${key}`;
  }
}