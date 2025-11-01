import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$%&#]).+$/, {
    message:
      'The password must include at least one uppercase letter, one lowercase letter, one number, and one special character: $, %, &, or #',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(25)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(25)
  lastname: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Matches(/^[0-9]{8}$/)
  @IsOptional()
  dni?: string;

  @Matches(/^[0-9]{9}$/)
  @IsOptional()
  phone?: string;
}
