import type { NextConfig } from 'next'
import { withWorkflow } from '@workflow/next'

const nextConfig: NextConfig = {
  // No extra Next.js config needed for the spike.
  // withWorkflow() injects the WDK SWC transform so 'use workflow' / 'use step'
  // directives are compiled correctly.
  allowedDevOrigins: ['100.108.13.41'],
}

export default withWorkflow(nextConfig)
