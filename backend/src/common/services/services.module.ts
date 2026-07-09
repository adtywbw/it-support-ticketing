import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RepositoriesModule } from '../repositories/repositories.module';

@Global()
@Module({
  imports: [RepositoriesModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class ServicesModule {}
