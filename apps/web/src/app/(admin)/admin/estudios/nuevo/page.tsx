'use client'

import { createClient } from "@/lib/supabase"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"

export default function NewEstudioPage() {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
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

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const title = e.target.value
        const slug = title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "")

        setFormData(prev => ({ ...prev, title, slug }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: newEstudio, error } = await supabase
                .from('estudios')
                .insert([{
                    title: formData.title,
                    slug: formData.slug,
                    description: formData.description,
                    content: formData.content,
                    category: formData.category,
                    image_url: formData.image_url || null,
                    pdf_url: formData.pdf_url || null,
                    is_published: formData.status === 'published',
                    published_at: formData.status === 'published' ? new Date().toISOString() : null
                }])
                .select()
                .single()

            if (error) throw error

            // Log audit
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                await supabase.from('audit_logs').insert({
                    user_id: user.id,
                    action: 'create',
                    entity: 'estudio',
                    entity_id: newEstudio.id,
                    details: { title: formData.title, slug: formData.slug }
                })
            }

            toast.success('Estudio creado exitosamente')
            router.push('/admin/estudios')
            router.refresh()
        } catch (error) {
            console.error('Error creating estudio:', error)
            toast.error('Error al crear el estudio')
        } finally {
            setLoading(false)
        }
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
                    <h2 className="text-3xl font-bold tracking-tight">Nuevo Estudio</h2>
                    <p className="text-muted-foreground">
                        Crea un nuevo estudio o investigación para el sitio.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detalles del Estudio</CardTitle>
                    <CardDescription>
                        Completa la información del estudio o investigación.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">Título</Label>
                                <Input
                                    id="title"
                                    placeholder="Título del estudio"
                                    value={formData.title}
                                    onChange={handleTitleChange}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="slug">Slug (URL)</Label>
                                <Input
                                    id="slug"
                                    placeholder="titulo-del-estudio"
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
                                placeholder="Breve descripción del estudio que aparecerá en las tarjetas..."
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
                                    placeholder="https://ejemplo.com/imagen.jpg"
                                    value={formData.image_url}
                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pdf">URL del PDF</Label>
                                <Input
                                    id="pdf"
                                    placeholder="https://ejemplo.com/estudio.pdf"
                                    value={formData.pdf_url}
                                    onChange={(e) => setFormData({ ...formData, pdf_url: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="content">Contenido Completo</Label>
                            <Textarea
                                id="content"
                                placeholder="Escribe el contenido del estudio aquí..."
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
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                Guardar Estudio
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
