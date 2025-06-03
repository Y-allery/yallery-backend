import { HttpStatus } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

export function sendHtmlResponse(
  res,
  templateFileName: string,
  status: HttpStatus,
  replacements: Record<string, string> = {},
) {
  const templatePath = join(
    __dirname,
    '..',
    '..',
    '..',
    'public',
    templateFileName,
  );
  console.log('Template Path:', templatePath);

  let template: string;

  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading template file ${templateFileName}:`, error);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send('Internal Server Error');
  }

  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(`{{${key}}}`, value);
  }

  res.set('Content-Type', 'text/html');
  return res.status(status).send(template);
}
