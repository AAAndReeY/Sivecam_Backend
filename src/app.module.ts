import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { NeighborhoodModule } from './modules/neighborhood/neighborhood.module';
import { MunicipalModule } from './modules/municipal/municipal.module';
import { SupervisorModule } from './modules/supervisor/supervisor.module';
import { OperatorModule } from './modules/operator/operator.module';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    NeighborhoodModule,
    MunicipalModule,
    SupervisorModule,
    OperatorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
