import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordedClassesController } from './recorded-classes.controller.js';
import { RecordedClassesService } from './recorded-classes.service.js';
import { RecordedClass } from './entities/recorded-class.entity.js';
import { RecordedClassView } from './entities/recorded-class-view.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([RecordedClass, RecordedClassView])],
    controllers: [RecordedClassesController],
    providers: [RecordedClassesService],
    exports: [RecordedClassesService],
})
export class RecordedClassesModule { }