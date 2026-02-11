import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

        const transports: winston.transport[] = [
          // Console transport
          new winston.transports.Console({
            format: isProduction
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.colorize(),
                  winston.format.simple(),
                ),
          }),
        ];

        // File transports in production
        if (isProduction) {
          transports.push(
            // Combined logs
            new winston.transports.DailyRotateFile({
              filename: 'logs/application-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '14d',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
            // Error logs
            new winston.transports.DailyRotateFile({
              filename: 'logs/error-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '30d',
              level: 'error',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );
        }

        return {
          level: logLevel,
          defaultMeta: {
            service: 'subtrack-api',
            environment: configService.get<string>('NODE_ENV', 'development'),
          },
          transports,
          exceptionHandlers: [
            new winston.transports.Console(),
            new winston.transports.File({ filename: 'logs/exceptions.log' }),
          ],
          rejectionHandlers: [
            new winston.transports.Console(),
            new winston.transports.File({ filename: 'logs/rejections.log' }),
          ],
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
