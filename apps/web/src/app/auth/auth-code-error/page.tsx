import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export default function AuthCodeErrorPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
            <div className="w-full max-w-md text-center space-y-6">
                <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">
                        Error al iniciar sesión
                    </h1>
                    <p className="text-muted-foreground">
                        Hubo un problema al autenticarte con Google. Esto puede ocurrir si
                        la sesión expiró o si hubo un error en la conexión.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                    >
                        Intentar de nuevo
                    </Link>
                    <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                        ← Volver al sitio público
                    </Link>
                </div>
            </div>
        </div>
    )
}
