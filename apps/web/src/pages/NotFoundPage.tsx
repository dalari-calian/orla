import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/States'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página não encontrada" />
      <Card>
        <EmptyState
          icon={SearchX}
          title="Nada por aqui"
          description="O endereço que você abriu não existe."
          action={
            <Link
              to="/"
              className="inline-flex min-h-11 items-center text-subhead font-medium text-accent"
            >
              Ir para o início
            </Link>
          }
        />
      </Card>
    </>
  )
}
