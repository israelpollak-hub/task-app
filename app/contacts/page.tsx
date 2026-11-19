"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Edit, Trash2, UserPlus, Save, X, Users } from "lucide-react";
import { useContacts } from "@/hooks/useContacts";
import { useToast } from "@/components/hooks/use-toast";
import { Contact } from "@/types/models";

const EMPTY_FORM = { name: "", relationship: "", email: "" };

export default function ContactsPage() {
  const { contacts, isLoading, error, createContact, updateContact, deleteContact } =
    useContacts();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = (contact: Contact) => {
    setEditingId(contact.contact_id);
    setForm({
      name: contact.name,
      relationship: contact.relationship ?? "",
      email: contact.email ?? "",
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateContact(editingId, form);
        toast({ title: "✅ Contact Updated", description: `${form.name.trim()} was updated` });
      } else {
        await createContact(form);
        toast({ title: "✅ Contact Added", description: `${form.name.trim()} was added` });
      }
      resetForm();
    } catch (error: any) {
      toast({
        title: "❌ Error",
        description: error.message || "Could not save the contact",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    try {
      await deleteContact(contact.contact_id);
      if (editingId === contact.contact_id) resetForm();
      toast({ title: "✅ Contact Deleted", description: `${contact.name} was deleted` });
    } catch (error: any) {
      toast({
        title: "❌ Could not delete",
        description: error.message || "Could not delete the contact",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Contacts</h1>

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Enter the person's name"
            required
          />
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="contact-relationship">Relationship (optional)</Label>
          <Input
            id="contact-relationship"
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            placeholder="For example: boss, client, friend"
          />
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="contact-email">Email (optional)</Label>
          <Input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@example.com"
          />
        </div>
        <div className="flex space-x-2">
          <Button type="submit" disabled={saving}>
            {editingId ? (
              <>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save Changes"}
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {saving ? "Adding..." : "Add Contact"}
              </>
            )}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <div className="text-center py-4 text-sm text-gray-700">{error}</div>
      ) : isLoading ? (
        <div>Loading...</div>
      ) : contacts.length > 0 ? (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-2">Name</TableHead>
                <TableHead className="py-2">Relationship</TableHead>
                <TableHead className="py-2">Email</TableHead>
                <TableHead className="w-[100px] text-right py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.contact_id} className="hover:bg-muted/50">
                  <TableCell className="py-2 font-medium">{contact.name}</TableCell>
                  <TableCell className="py-2">{contact.relationship}</TableCell>
                  <TableCell className="py-2 break-all">{contact.email}</TableCell>
                  <TableCell className="text-right py-2 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEditing(contact)}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(contact)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="border rounded-md p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-gray-400 mb-4" />
          <p className="text-gray-500">Add a contact to get started.</p>
        </div>
      )}

      <div className="pt-6">
        <Link href="/dashboard">
          <Button type="button" variant="outline" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
