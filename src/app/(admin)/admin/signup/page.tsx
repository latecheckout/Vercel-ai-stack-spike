import { SignupForm } from '@/components/admin/signup-form'

export const metadata = { title: 'Admin sign up' }

export default function AdminSignupPage() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Anyone can sign up, but admin access is granted separately by another admin in the
          /admin/admins page.
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
