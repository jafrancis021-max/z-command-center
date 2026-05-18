'use server'

import { revalidatePath } from 'next/cache'
import { createTask, createDecision, createNote, updateTaskStatus, deleteTask } from '@/lib/supabase'

export async function addTaskAction(projectId: string, title: string, description: string, priority: string) {
  const task = await createTask(projectId, title, description, priority)
  revalidatePath(`/projects/${projectId}`)
  return task
}

export async function addDecisionAction(projectId: string, decision: string) {
  const dec = await createDecision(projectId, decision)
  revalidatePath(`/projects/${projectId}`)
  return dec
}

export async function addNoteAction(projectId: string, note: string) {
  const n = await createNote(projectId, note)
  revalidatePath(`/projects/${projectId}`)
  return n
}

export async function updateTaskStatusAction(taskId: string, status: string, projectId: string) {
  await updateTaskStatus(taskId, status)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteTaskAction(taskId: string, projectId: string) {
  await deleteTask(taskId)
  revalidatePath(`/projects/${projectId}`)
}
