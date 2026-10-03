import { Global, Module } from '@nestjs/common';
import { SessionEventsService } from './session-events.service';

// Global para que auth, usuarios y roles compartan la misma instancia (mismos canales)
@Global()
@Module({
  providers: [SessionEventsService],
  exports: [SessionEventsService],
})
export class SessionEventsModule {}
