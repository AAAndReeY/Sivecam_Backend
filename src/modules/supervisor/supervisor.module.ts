import { Module } from '@nestjs/common';
import { SupervisorController } from './supervisor.controller';
import { UserService } from '../user/user.service';

@Module({
  controllers: [SupervisorController],
  providers: [UserService],
})
export class SupervisorModule {}
