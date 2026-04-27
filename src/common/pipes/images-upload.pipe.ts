import { BadRequestException, PipeTransform } from '@nestjs/common';

export type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};

type ImagesUploadPipeOptions = {
  minFiles?: number;
  maxFiles?: number;
  maxSizeInBytes?: number;
  allowedMimeTypes?: RegExp;
  fieldName?: string;
};

export class ImagesUploadPipe implements PipeTransform {
  private readonly minFiles: number;
  private readonly maxFiles: number;
  private readonly maxSizeInBytes: number;
  private readonly allowedMimeTypes: RegExp;
  private readonly fieldName: string;

  constructor(options: ImagesUploadPipeOptions = {}) {
    this.minFiles = options.minFiles ?? 0;
    this.maxFiles = options.maxFiles ?? 3;
    this.maxSizeInBytes = options.maxSizeInBytes ?? 5 * 1024 * 1024;
    this.allowedMimeTypes =
      options.allowedMimeTypes ?? /^image\/(jpeg|jpg|png|webp)$/i;
    this.fieldName = options.fieldName ?? 'images';
  }

  transform(files?: UploadedImageFile[]) {
    const uploadedFiles = files ?? [];

    if (uploadedFiles.length < this.minFiles) {
      throw new BadRequestException(
        `${this.fieldName} requires at least ${this.minFiles} image file${
          this.minFiles === 1 ? '' : 's'
        }.`,
      );
    }

    if (uploadedFiles.length > this.maxFiles) {
      throw new BadRequestException(
        `${this.fieldName} allows a maximum of ${this.maxFiles} image files.`,
      );
    }

    for (const file of uploadedFiles) {
      if (!file.buffer) {
        throw new BadRequestException('Uploaded image file is invalid.');
      }

      if (file.size && file.size > this.maxSizeInBytes) {
        throw new BadRequestException(
          `${file.originalname ?? 'Image'} exceeds the maximum size of ${Math.floor(
            this.maxSizeInBytes / (1024 * 1024),
          )}MB.`,
        );
      }

      if (!file.mimetype || !this.allowedMimeTypes.test(file.mimetype)) {
        throw new BadRequestException(
          `${file.originalname ?? 'Image'} must be a JPG, PNG, or WEBP file.`,
        );
      }
    }

    return uploadedFiles;
  }
}
