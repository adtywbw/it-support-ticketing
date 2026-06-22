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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('tickets/:ticketId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('ticketId') ticketId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.attachmentsService.upload(ticketId, file, userId);
  }

  @Get('tickets/:ticketId/attachments')
  async findByTicketId(@Param('ticketId') ticketId: string) {
    return this.attachmentsService.findByTicketId(ticketId);
  }

  @Get('attachments/:id/download')
  async download(
    @Param('id') id: string,
    @Query('view') view: string,
    @Res() res: Response,
  ) {
    const attachment = await this.attachmentsService.getDownloadInfo(id);

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
