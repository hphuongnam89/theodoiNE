import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
