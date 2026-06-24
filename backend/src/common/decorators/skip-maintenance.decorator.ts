import { SetMetadata } from '@nestjs/common';

export const SkipMaintenance = () => SetMetadata('skipMaintenance', true);
