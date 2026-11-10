import {
  loginRequestSchema,
  registerRequestSchema,
  type LoginRequest,
  type RegisterRequest,
} from '@orla/contracts'
import { Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { errorMessage } from '@/lib/api'
import { applyApiFieldErrors, zodResolver } from '@/lib/form'
import { useAuthConfig, useLogin, useRegister } from './api'

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="pt-safe flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo size="lg" className="animate-enter" />
          <h1 className="mt-8 text-title-1 font-bold">{title}</h1>
          <p className="mt-1 text-subhead text-text-2">{subtitle}</p>
        </div>
        <div className="rounded-card bg-surface p-5 shadow-card md:p-6">{children}</div>
        <p className="mt-6 text-center text-subhead text-text-2">{footer}</p>
      </div>
    </div>
  )
}

/** Botão de mostrar/ocultar senha dentro do campo. */
function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const Icon = visible ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
      className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  )
}

export function LoginPage() {
  const login = useLogin()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { username: '', password: '' },
  })
  const { errors } = form.formState

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Bom te ver de novo."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-accent">
            Criar conta
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        <TextField
          label="Usuário"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={errors.username?.message}
          {...form.register('username')}
        />
        <TextField
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          error={errors.password?.message}
          trailing={
            <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          }
          {...form.register('password')}
        />
        {login.isError && (
          <p role="alert" className="text-footnote text-negative">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" block loading={login.isPending}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}

const signupFormSchema = registerRequestSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })
type SignupForm = z.input<typeof signupFormSchema>

export function SignupPage() {
  const config = useAuthConfig()
  const registerUser = useRegister()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<SignupForm, unknown, z.output<typeof signupFormSchema>>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      username: '',
      displayName: '',
      password: '',
      confirmPassword: '',
      inviteCode: '',
    },
  })
  const { errors } = form.formState
  const mode = config.data?.signupMode

  const onSubmit = form.handleSubmit(({ confirmPassword: _confirm, ...values }) => {
    const input: RegisterRequest = {
      ...values,
      inviteCode: mode === 'invite' ? values.inviteCode : undefined,
    }
    registerUser.mutate(input, {
      onError: (error) =>
        applyApiFieldErrors(error, form.setError, [
          'username',
          'password',
          'displayName',
          'inviteCode',
        ]),
    })
  })

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Seu controle financeiro, sem planilha."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-accent">
            Entrar
          </Link>
        </>
      }
    >
      {config.isError && (
        <ErrorState
          description={errorMessage(config.error)}
          onRetry={() => void config.refetch()}
        />
      )}
      {mode === 'closed' && (
        <p className="text-body text-text-2">O cadastro de novas contas está fechado no momento.</p>
      )}
      {(config.isPending || mode === 'invite' || mode === 'open') && (
        <form noValidate className="space-y-4" onSubmit={onSubmit}>
          <TextField
            label="Como quer ser chamado"
            autoComplete="name"
            placeholder="Opcional"
            error={errors.displayName?.message}
            {...form.register('displayName')}
          />
          <TextField
            label="Usuário"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="Letras minúsculas, números, ponto e sublinhado."
            error={errors.username?.message}
            {...form.register('username')}
          />
          <TextField
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            hint="Pelo menos 8 caracteres."
            error={errors.password?.message}
            trailing={
              <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            }
            {...form.register('password')}
          />
          <TextField
            label="Confirme a senha"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
          {mode === 'invite' && (
            <TextField
              label="Código de convite"
              autoCapitalize="none"
              autoCorrect="off"
              error={errors.inviteCode?.message}
              {...form.register('inviteCode')}
            />
          )}
          {registerUser.isError && (
            <p role="alert" className="text-footnote text-negative">
              {errorMessage(registerUser.error)}
            </p>
          )}
          <Button type="submit" block loading={registerUser.isPending} disabled={config.isPending}>
            Criar conta
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
