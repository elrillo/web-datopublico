'use client'

import { createClient } from "@/lib/supabase"
import { useEffect, useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/Table"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Edit, FileText, Loader2, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

type EstudioItem = {
    id: string
    title: string
    slug: string
    category: string | null
    published_at: string | null
    is_published: boolean
    pdf_url: string | null
    created_at: string
}

export default function EstudiosListPage() {
    const [estudios, setEstudios] = useState<EstudioItem[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchEstudios()
    }, [])

    const fetchEstudios = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('estudios')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching estudios:', error)
            toast.error('Error al cargar los estudios')
        } else {
            setEstudios(data as EstudioItem[])
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este estudio?')) return

        const { error } = await supabase
            .from('estudios')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting estudio:', error)
            toast.error('Error al eliminar el estudio')
        } else {
            // Log audit
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await supabase.from('audit_logs').insert({
                    user_id: user.id,
                    action: 'delete',
                    entity: 'estudio',
                    entity_id: id,
                    details: { deleted: true }
                })
            }

            toast.success('Estudio eliminado correctamente')
            setEstudios(estudios.filter(e => e.id !== id))
        }
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Estudios</h2>
                    <p className="text-muted-foreground">
                        Gestiona los estudios, investigaciones y reportes del sitio.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/admin/estudios/nuevo">
                        <Plus className="mr-2 h-4 w-4" /> Nuevo Estudio
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Estudios e Investigaciones</CardTitle>
                    <CardDescription>
                        Lista de estudios, informes y análisis publicados.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Título</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>PDF</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {estudios.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No hay estudios registrados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                estudios.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">
                                            {item.title}
                                            <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                                                /{item.slug}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {item.category ? (
                                                <Badge variant="outline" className="capitalize">
                                                    {item.category}
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={item.is_published ? "default" : "secondary"}>
                                                {item.is_published ? "Publicado" : "Borrador"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {item.pdf_url ? (
                                                <FileText className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {item.published_at ? new Date(item.published_at).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="ghost" size="icon" asChild>
                                                <Link href={`/admin/estudios/${item.id}`}>
                                                    <Edit className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
