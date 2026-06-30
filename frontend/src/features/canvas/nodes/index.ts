// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import type { NodeTypes } from '@xyflow/react';

import { AudioNode } from './AudioNode';
import { BeatContextNode } from './BeatContextNode';
import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageGenNode } from './ImageGenNode';
import { ImageNode } from './ImageNode';
import { Pano360ViewerNode } from './Pano360ViewerNode';
import { ScriptNode } from './ScriptNode';
import { SkillNode } from './SkillNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { ThreeDWorldNode } from './ThreeDWorldNode';
import { UploadNode } from './UploadNode';
import { VideoComposeNode } from './VideoComposeNode';
import { VideoNode } from './VideoNode';
import { VideoStoryNode } from './VideoStoryNode';

export const nodeTypes: NodeTypes = {
  audioNode: AudioNode,
  beatContextNode: BeatContextNode,
  exportImageNode: ImageNode,
  groupNode: GroupNode,
  imageGenNode: ImageGenNode,
  imageNode: ImageEditNode,
  pano360ViewerNode: Pano360ViewerNode,
  scriptNode: ScriptNode,
  skillNode: SkillNode,
  storyboardGenNode: StoryboardGenNode,
  storyboardNode: StoryboardNode,
  textAnnotationNode: TextAnnotationNode,
  threeDWorldNode: ThreeDWorldNode,
  uploadNode: UploadNode,
  videoComposeNode: VideoComposeNode,
  videoNode: VideoNode,
  videoStoryNode: VideoStoryNode,
};

export { AudioNode, BeatContextNode, GroupNode, ImageEditNode, ImageGenNode, ImageNode, Pano360ViewerNode, ScriptNode, SkillNode, StoryboardGenNode, StoryboardNode, TextAnnotationNode, ThreeDWorldNode, UploadNode, VideoComposeNode, VideoNode, VideoStoryNode };
