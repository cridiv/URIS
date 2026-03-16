import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'uris-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
