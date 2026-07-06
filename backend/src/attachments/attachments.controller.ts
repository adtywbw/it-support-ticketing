import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { ALLOWED_MIME_TYPES } from '../common/utils/mime-validation.util';
import { appConfig } from '../common/config/app.config';

const MAX_FILE_SIZE = appConfig.fileUpload.maxDirectFileSize;

@Controller()
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('tickets/:ticketId/attachments')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
        return;
      }
      callback(null, true);
    },
  }))
  async upload(
    @Param('ticketId') ticketId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string; role: string },
    @Body() body: UploadAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.attachmentsService.upload(ticketId, file, user.id, user.role, body.visibility);
  }

  @Get('tickets/:ticketId/attachments')
  async findByTicketId(
    @Param('ticketId') ticketId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.attachmentsService.findByTicketId(ticketId, user.id, user.role, query.page ?? 1, query.limit ?? 20);
  }

  @Get('attachments/:id/download')
  async download(
    @Param('id') id: string,
    @Query('view') view: string,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const attachment = await this.attachmentsService.getDownloadInfo(id, user.id, user.role);

    try {
      await fs.access(attachment.path);
    } catch {
      throw new BadRequestException('File not found on disk');
    }

    const safeName = attachment.originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 200);

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${view === '1' ? 'inline' : 'attachment'}; filename="${safeName}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache');

    const fileStream = createReadStream(attachment.path);
    fileStream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'STREAM_ERROR', message: 'Failed to read file' } });
      } else {
        res.end();
      }
    });
    fileStream.pipe(res);
  }
}
