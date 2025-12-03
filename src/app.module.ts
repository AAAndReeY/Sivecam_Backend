import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunalModule } from './modules/communal/communal.module';
import { IncidenceModule } from './modules/incidence/incidence.module';
import { MunicipalModule } from './modules/municipal/municipal.module';
import { SqlModule } from './modules/sql/sql.module';
import { TypologyModule } from './modules/typology/typology.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    CommunalModule,
    IncidenceModule,
    MunicipalModule,
    SqlModule,
    TypologyModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
