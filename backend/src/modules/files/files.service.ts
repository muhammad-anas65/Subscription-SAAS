import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FilesService {
  private uploadPath: string;
  private maxFileSize: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.uploadPath = this.configService.get<string>('FILE_UPLOAD_PATH', '/app/uploads');
    this.maxFileSize = this.configService.get<number>('FILE_UPLOAD_MAX_SIZE', 10 * 1024 * 1024);

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    subscriptionId: string,
    description: string | undefined,
    requestingUser: any,
  ) {
    // Validate subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }

    // Generate unique filename
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Save file
    fs.writeFileSync(filePath, file.buffer);

    // Create database record
    const attachment = await this.prisma.subscriptionAttachment.create({
      data: {
        subscriptionId,
        fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        filePath,
        description,
        uploadedBy: requestingUser.userId,
      },
    });

    return {
      id: attachment.id,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      description: attachment.description,
      createdAt: attachment.createdAt,
    };
  }

  async getFile(id: string, requestingUser: any) {
    const attachment = await this.prisma.subscriptionAttachment.findUnique({
      where: { id },
      include: {
        subscription: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (attachment.subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    // Check if file exists
    if (!fs.existsSync(attachment.filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return attachment;
  }

  async deleteFile(id: string, requestingUser: any) {
    const attachment = await this.prisma.subscriptionAttachment.findUnique({
      where: { id },
      include: {
        subscription: {
          select: {
            tenantId: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (attachment.subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    // Delete file from disk
    if (fs.existsSync(attachment.filePath)) {
      fs.unlinkSync(attachment.filePath);
    }

    // Delete database record
    await this.prisma.subscriptionAttachment.delete({
      where: { id },
    });

    return { message: 'File deleted successfully' };
  }

  async getFilesBySubscription(subscriptionId: string, requestingUser: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check permissions
    if (requestingUser.role !== UserRole.SUPER_ADMIN) {
      if (subscription.tenantId !== requestingUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const files = await this.prisma.subscriptionAttachment.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        description: true,
        createdAt: true,
        uploadedBy: true,
      },
    });

    return files;
  }
}
