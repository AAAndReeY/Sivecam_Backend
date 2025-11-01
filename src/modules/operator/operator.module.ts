import { Module } from '@nestjs/common';
import { OperatorController } from './operator.controller';
import { UserService } from '../user/user.service';

@Module({
  controllers: [OperatorController],
  providers: [UserService],
})
export class OperatorModule {}
