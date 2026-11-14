export const ENV = {
  ownerOpenId: process.env.OWNER_OPEN_ID || 'local-owner-openid',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'finance-agent-dev-secret-key-2026',
  llmApiKey:
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.BUILT_IN_FORGE_API_KEY ||
    '',
  llmBaseUrl:
    process.env.LLM_BASE_URL ||
    process.env.BUILT_IN_FORGE_API_URL ||
    'https://api.openai.com/v1',
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
};
