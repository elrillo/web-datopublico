'use client'

import { createClient } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"

export default function EditEstudioPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        description: '',
        content: '',
        category: 'investigacion',
        image_url: '',
        pdf_url: '',
        status: 'draft'
    })

    useEffect(() => {
        const fetchEstudio = async () => {
            const { data, error } = await supabase
                .from('estudios')
                .select('*')
                .eq('id', params.id)
                .single()

            if (error) {
                console.error('Error fetching estudio:', error)
                toast.error('Error al cargar el estudio')
                router.push('/admin/estudios')
            } else {
                setFormData({
                    title: data.title,
                    slug: data.slug,
                    description: data.description || '',
                    content: data.content || '',
                    category: data.category || 'investigacion',
                    image_url: data.image_url || '',
                    pdf_url: data.pdf_url || '',
                    status: data.is_published ? 'published' : 'draft'
                })
                setLoading(false)
            }
        }
        fetchEstudio()
    }, [params.id, router, supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const { error } = await supabase
                .from('estudios')
                .update({
                    title: formData.title,
                    slug: formData.slug,
                    description: formData.description,
                    content: formData.content,
                    category: formData.category,
                    image_url: formData.image_url || null,
                    pdf_url: formData.pdf_url || null,
                    is_published: formData.status === 'published',
                    published_at: formData.status === 'published' ? new Date().toISOString() : null
                })
                .eq('id', params.id)

            if (error) throw error

            // Log audit
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await supabase.from('audit_logs').insert({
                    user_id: user.id,
                    action: 'update',
                    entity: 'estudio',
                    entity_id: params.id as string,
                    details: { title: formData.title, status: formData.status }
                })
            }

            toast.success('Estudio actualizado exitosamente')
            router.push('/admin/estudios')
            router.refresh()
        } catch (error) {
            console.error('Error updating estudio:', error)
            toast.error('Error al actualizar el estudio')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/estudios">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Editar Estudio</h2>
                    <p className="text-muted-foreground">
                        Modifica el contenido del estudio o investigación.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detalles del Estudio</CardTitle>
                    <CardDescription>
                        Actualiza la información del estudio.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">Título</Label>
                                <Input
                                    id="title"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="slug">Slug (URL)</Label>
                                <Input
                                    id="slug"
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="category">Categoría</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(val) => setFormData({ ...formData, category: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="investigacion">Investigación</SelectItem>
                                        <SelectItem value="reporte">Reporte</SelectItem>
                                        <SelectItem value="analisis">Análisis</SelectItem>
                                        <SelectItem value="informe">Informe</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="status">Estado</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(val) => setFormData({ ...formData, status: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona estado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Borrador</SelectItem>
                                        <SelectItem value="published">Publicado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Descripción Corta</Label>
                            <Textarea
                                id="description"
                                placeholder="Breve descripción del estudio..."
                                className="h-20"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="image">URL de Imagen de Portada</Label>
                                <Input
                                    id="image"
                                    value={formData.image_url}
                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pdf">URL del PDF</Label>
                                <Input
                                    id="pdf"
                                    value={formData.pdf_url}
                                    onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="content">Contenido Completo</Label>
                            <Textarea
                                id="content"
                                className="min-h-[300px]"
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button variant="outline" type="button" asChild>
                                <Link href="/admin/estudios">Cancelar</Link>
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                Guardar Cambios
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
