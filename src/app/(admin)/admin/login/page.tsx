import { LoginForm } from '@/components/admin/login-form'

export const metadata = { title: 'Admin sign in' }

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  return <LoginFormWrapper searchParams={searchParams} />
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <div className="mx-auto w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Admins only. Visitors don&apos;t need an account — anonymous chat is on the home page.
        </p>
      </div>
      <LoginForm next={next ?? '/admin'} />
    </div>
  )
}
