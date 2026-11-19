"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Save,
  Upload,
  CalendarIcon,
  ArrowLeft,
  Trash2,
  AlertOctagon,
  Plus,
  Check,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import { getLabelOptions } from "@/lib/labels";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { useTaskManager } from "@/hooks/useTaskManager";
import { Task, ContactRole } from "@/types/models";
import { useTaskContacts } from "@/hooks/useTaskContacts";
import { CONTACT_ROLES } from "@/lib/contacts";
import { useSubtasks, MAX_SUBTASK_LENGTH } from "@/hooks/useSubtasks";
import { useAuth } from "@/hooks/useAuth";
import { canUseAiSubtasks } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/hooks/use-toast";
import Image from "next/image";
import { useDropzone } from "react-dropzone";

function TaskForm() {
  const params = useSearchParams();
  const taskId = params.get("id")!;
  const {
    task,
    date,
    userLabels,
    setDate,
    updateTask,
    saveTask,
    uploadImage,
    removeImage,
    error,
  } = useTaskManager(taskId);
  const { session, user } = useAuth();
  const { toast } = useToast();
  // AI suggestions are only for the Pro plan (the server checks this too)
  const canSuggest = canUseAiSubtasks(user?.subscription_plan);
  const [uploading, setUploading] = useState(false);

  // People linked to this task
  const {
    people,
    availableContacts,
    hasAnyContacts,
    isLoadingPeople,
    peopleError,
    addPerson,
    changeRole,
    removePerson,
  } = useTaskContacts(taskId);
  const [contactToAdd, setContactToAdd] = useState("");
  const [roleToAdd, setRoleToAdd] = useState<ContactRole>("collaborator");

  const handleAddPerson = async () => {
    if (!contactToAdd) return;
    try {
      await addPerson(contactToAdd, roleToAdd);
      setContactToAdd("");
      toast({ title: "✅ Person Added", description: "Person added to the task" });
    } catch (error: any) {
      toast({
        title: "❌ Could not add",
        description: error.message || "Failed to add the person",
        variant: "destructive",
      });
    }
  };

  const handleChangeRole = async (contactId: string, role: ContactRole) => {
    try {
      await changeRole(contactId, role);
    } catch (error: any) {
      toast({
        title: "❌ Could not change the role",
        description: error.message || "Failed to change the role",
        variant: "destructive",
      });
    }
  };

  const handleRemovePerson = async (contactId: string) => {
    try {
      await removePerson(contactId);
      toast({ title: "✅ Person Removed", description: "Person removed from the task" });
    } catch (error: any) {
      toast({
        title: "❌ Could not remove",
        description: error.message || "Failed to remove the person",
        variant: "destructive",
      });
    }
  };

  // Subtasks of this task, and the AI suggestions waiting for an answer
  const {
    subtasks,
    suggestions,
    isLoadingSubtasks,
    isSuggesting,
    subtasksError,
    addSubtask,
    toggleDone,
    deleteSubtask,
    suggest,
    acceptSuggestion,
    rejectSuggestion,
    clearSuggestions,
  } = useSubtasks(taskId);
  const [newSubtask, setNewSubtask] = useState("");

  const showSubtaskError = (title: string, error: any, fallback: string) => {
    toast({
      title,
      description: error?.message || fallback,
      variant: "destructive",
    });
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await addSubtask(newSubtask);
      setNewSubtask("");
    } catch (error: any) {
      showSubtaskError("❌ Could not add", error, "Failed to add the subtask");
    }
  };

  const handleToggleSubtask = async (subtaskId: string, isDone: boolean) => {
    try {
      await toggleDone(subtaskId, isDone);
    } catch (error: any) {
      showSubtaskError("❌ Could not update", error, "Failed to update the subtask");
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtask(subtaskId);
    } catch (error: any) {
      showSubtaskError("❌ Could not delete", error, "Failed to delete the subtask");
    }
  };

  const handleSuggest = async () => {
    try {
      await suggest();
    } catch (error: any) {
      showSubtaskError("❌ No suggestions", error, "Could not get suggestions");
    }
  };

  const handleAcceptSuggestion = async (title: string) => {
    try {
      await acceptSuggestion(title);
    } catch (error: any) {
      showSubtaskError("❌ Could not add", error, "Failed to add the subtask");
    }
  };

  const handleImageUpload = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadImage(file);
      toast({
        title: "✅ Image Uploaded",
        description: "Image uploaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "❌ Upload Failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleImageUpload,
    accept: {
      "image/jpeg": [],
      "image/png": [],
    },
    maxFiles: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveTask();
      toast({
        title: "✅ Task Updated",
        description: "Task updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "❌ Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
  };

  const handleRemoveImage = async () => {
    try {
      await removeImage();
      toast({
        title: "✅ Image Removed",
        description: "Image removed successfully",
      });
    } catch (error: any) {
      toast({
        title: "❌ Remove Failed",
        description: error.message || "Failed to remove image",
        variant: "destructive",
      });
    }
  };

  const renderImageDisplay = () => {
    return (
      <div className="space-y-2">
        <div className="relative w-40 h-40 rounded-lg overflow-hidden">
          <Image
            src={`${
              process.env.NEXT_PUBLIC_SUPABASE_URL
            }/storage/v1/object/public/task-attachments/${task!.image_url}`}
            alt="Task attachment"
            fill
            sizes="160px"
            className="object-cover"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleRemoveImage}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Remove Image
        </Button>
      </div>
    );
  };

  const renderImageUpload = () => {
    return (
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-md p-6 text-center cursor-pointer",
          isDragActive ? "border-blue-500" : "border-gray-300"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        {isDragActive ? (
          <p className="text-sm text-blue-500">Drop the image here...</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-gray-500">
              Drag and drop an image here, or click to select
            </p>
            <p className="text-xs text-gray-400">Supports: JPEG, PNG</p>
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertOctagon className="mx-auto h-8 w-8 text-gray-500 mb-2" />
        <div className="text-gray-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!task) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Task Details</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid w-full items-center gap-1.5">
          <Label>Title</Label>
          <Input
            value={task.title || ""}
            onChange={(e) => updateTask({ title: e.target.value })}
          />
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label>Description</Label>
          <Textarea
            value={task.description || ""}
            onChange={(e) => updateTask({ description: e.target.value })}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            checked={task.completed || false}
            onCheckedChange={(checked) =>
              updateTask({ completed: checked as boolean })
            }
          />
          <Label>Completed</Label>
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label>Label</Label>
          <Select
            value={task.label || ""}
            onValueChange={(value) =>
              updateTask({ label: value as Task["label"] })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a label" />
            </SelectTrigger>
            <SelectContent>
              {getLabelOptions([...userLabels, task.label]).map((label) => (
                <SelectItem key={label.value} value={label.value}>
                  {label.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label>Due Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label>Attach Image</Label>
          <div className="space-y-2">
            {task.image_url ? renderImageDisplay() : renderImageUpload()}
          </div>
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label>People</Label>
          {peopleError ? (
            <p className="text-sm text-gray-500">{peopleError}</p>
          ) : isLoadingPeople ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-2">
              {people.length === 0 && (
                <p className="text-sm text-gray-500">No people in this task yet.</p>
              )}
              {people.map(({ contact, role }) => (
                <div
                  key={contact.contact_id}
                  className="flex items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{contact.name}</div>
                    {contact.relationship && (
                      <div className="text-xs text-gray-500 truncate">
                        {contact.relationship}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select
                      value={role}
                      onValueChange={(value) =>
                        handleChangeRole(contact.contact_id, value as ContactRole)
                      }
                    >
                      <SelectTrigger className="w-[150px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemovePerson(contact.contact_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove {contact.name}</span>
                    </Button>
                  </div>
                </div>
              ))}

              {!hasAnyContacts ? (
                <p className="text-sm text-gray-500">
                  You have no contacts yet.{" "}
                  <Link href="/contacts" className="underline">
                    Add some on the Contacts page
                  </Link>
                  .
                </p>
              ) : availableContacts.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Select value={contactToAdd} onValueChange={setContactToAdd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add a person..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableContacts.map((c) => (
                        <SelectItem key={c.contact_id} value={c.contact_id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={roleToAdd}
                    onValueChange={(value) => setRoleToAdd(value as ContactRole)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!contactToAdd}
                    onClick={handleAddPerson}
                  >
                    Add
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  All your contacts are already in this task.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid w-full items-center gap-1.5">
          <div className="flex items-center justify-between">
            <Label>
              Subtasks
              {subtasks.length > 0 &&
                ` (${subtasks.filter((s) => s.is_done).length}/${subtasks.length} done)`}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSuggesting || !canSuggest}
              onClick={handleSuggest}
            >
              {isSuggesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isSuggesting ? "Thinking..." : "Suggest subtasks with AI"}
              {!canSuggest && (
                <Badge variant="secondary" className="ml-2">
                  Pro
                </Badge>
              )}
            </Button>
          </div>
          {!canSuggest && (
            <p className="text-sm text-gray-500">
              AI subtask suggestions are part of the Pro plan.{" "}
              <Link href="/profile" className="underline">
                Upgrade on your Profile page
              </Link>
              .
            </p>
          )}
          {subtasksError ? (
            <p className="text-sm text-gray-500">{subtasksError}</p>
          ) : isLoadingSubtasks ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-2">
              {subtasks.length === 0 && suggestions.length === 0 && (
                <p className="text-sm text-gray-500">No subtasks yet.</p>
              )}
              {subtasks.map((subtask) => (
                <div
                  key={subtask.subtask_id}
                  className="flex items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={subtask.is_done}
                      onCheckedChange={(checked) =>
                        handleToggleSubtask(subtask.subtask_id, checked === true)
                      }
                      aria-label={`Mark "${subtask.title}" as done`}
                    />
                    <span
                      className={cn(
                        "truncate",
                        subtask.is_done && "line-through text-gray-400"
                      )}
                    >
                      {subtask.title}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleDeleteSubtask(subtask.subtask_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete {subtask.title}</span>
                  </Button>
                </div>
              ))}

              {suggestions.length > 0 && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      AI suggestions: accept the ones you want
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSuggestions}
                    >
                      Dismiss all
                    </Button>
                  </div>
                  {suggestions.map((title) => (
                    <div
                      key={title}
                      className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm">{title}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcceptSuggestion(title)}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => rejectSuggestion(title)}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={newSubtask}
                  maxLength={MAX_SUBTASK_LENGTH}
                  placeholder="Add a subtask..."
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds the subtask; it must not save the whole task form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newSubtask.trim()}
                  onClick={handleAddSubtask}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex space-x-2 w-full pt-4">
          <Link href="/dashboard" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <Button type="submit" className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function TaskDetail() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TaskForm />
    </Suspense>
  );
}
