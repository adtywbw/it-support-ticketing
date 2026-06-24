import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.attachmentsService.upload(ticketId, file, user.id, user.role);
  }

  @Get('tickets/:ticketId/attachments')
  async findByTicketId(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.attachmentsService.findByTicketId(ticketId, user.id, user.role);
  }

  @Get('attachments/:id/download')
  async download(
    @Param('id') id: string,
    @Query('view') view: string,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const attachment = await this.attachmentsService.getDownloadInfo(id, user.id, user.role);

    res.setHeader('Content-Type', attachment.mimeType);
    if (view === '1') {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${attachment.originalName}"`,
      );
    } else {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${attachment.originalName}"`,
      );
    }

    const fileStream = fs.createReadStream(attachment.path);
    fileStream.pipe(res);
  }
}
