import 'reflect-metadata';
import { AuditService } from './src/common/services/audit.service';
import { ServicesModule } from './src/common/services/services.module';
import { HttpException, HttpStatus } from '@nestjs/common';

let p = 0, f = 0;
const ok = (m: string) => (p++, console.log(`  PASS: ${m}`));
const ko = (m: string) => (f++, console.error(`  FAIL: ${m}`));

const svc = new AuditService();
ok('AuditService instantiated');

try { svc.log('create', 'Ticket', 't-1', 'u-1', { status: 'open' }); ok('log() with metadata'); }
catch { ko('log() with metadata threw'); }

try { svc.log('read', 'User', 'u-42', 'admin'); ok('log() without metadata'); }
catch { ko('log() without metadata threw'); }

try {
  svc.logAndThrow('delete', 'Ticket', 't-99', 'u-5',
    new HttpException('Forbidden', HttpStatus.FORBIDDEN));
  ko('logAndThrow did not throw');
} catch (e) {
  e instanceof HttpException ? ok('logAndThrow → HttpException') : ko('wrong type');
  (e as HttpException).getStatus() === 403 ? ok('  status=403') : ko('  wrong status');
  (e as HttpException).message === 'Forbidden' ? ok('  message preserved') : ko('  wrong message');
}

const prov = Reflect.getMetadata('providers', ServicesModule);
Array.isArray(prov) && prov.includes(AuditService) ? ok('Module provider') : ko('Module missing provider');

const exp = Reflect.getMetadata('exports', ServicesModule);
Array.isArray(exp) && exp.includes(AuditService) ? ok('Module export') : ko('Module missing export');

console.log(`\n=== Ad-hoc verification: ${p} passed, ${f} failed ===`);
process.exit(f > 0 ? 1 : 0);
