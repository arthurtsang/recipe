/**
 * Script to re-download images for recipes that have external URLs
 * This fixes recipes where images were not properly downloaded during import
 */
import { PrismaClient } from '@prisma/client';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';

const prisma = new PrismaClient();

async function downloadAndSaveImage(imageUrl: string): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl; // Return as-is if not external URL
  }

  try {
    const url = new URL(imageUrl);
    const fileExt = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const ext = validExts.includes(fileExt) ? fileExt : 'jpg';
    
    // Generate unique filename
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const filename = `recipe-${hash}.${ext}`;
    const filepath = path.join(process.cwd(), 'uploads', filename);
    
    console.log(`  Downloading from ${imageUrl}`);
    
    // Ensure uploads directory exists
    const uploadsDir = path.dirname(filepath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`  File already exists: ${filename}`);
      return `/uploads/${filename}`;
    }

    // Download image
    const client = url.protocol === 'https:' ? https : http;
    
    return await new Promise<string>((resolve, reject) => {
      const requestOptions = {
        timeout: 15000, // Longer timeout for re-downloads
        rejectUnauthorized: false
      };
      
      const request = client.get(imageUrl, requestOptions, (response) => {
        if (response.statusCode !== 200) {
          console.warn(`  Failed: HTTP ${response.statusCode}`);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`  ✓ Downloaded: ${filename}`);
          resolve(`/uploads/${filename}`);
        });

        fileStream.on('error', (err) => {
          console.error(`  Error writing file:`, err);
          fs.unlink(filepath, () => {});
          reject(err);
        });
      });

      request.on('error', (err) => {
        console.error(`  Error downloading:`, err.message);
        reject(err);
      });

      request.setTimeout(15000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  } catch (error) {
    console.error(`  Error:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function redownloadRecipeImages() {
  console.log('Analyzing recipe images...\n');
  
  // Get all recipes with images
  const allRecipes = await prisma.recipe.findMany({
    select: {
      id: true,
      title: true,
      imageUrl: true,
      sourceUrl: true,
    }
  });

  console.log(`Total recipes: ${allRecipes.length}`);

  // Find recipes with external URLs
  const recipes = allRecipes.filter(r => r.imageUrl && r.imageUrl.startsWith('http'));
  console.log(`Recipes with external URLs: ${recipes.length}`);

  // Find recipes with /uploads/ paths
  const recipesWithLocalPaths = allRecipes.filter(r => r.imageUrl && r.imageUrl.startsWith('/uploads/'));
  console.log(`Recipes with local paths: ${recipesWithLocalPaths.length}`);

  // Check which local files actually exist and collect missing ones
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const recipesWithMissingFiles: typeof allRecipes = [];
  for (const recipe of recipesWithLocalPaths) {
    if (recipe.imageUrl) {
      const filepath = path.join(process.cwd(), recipe.imageUrl);
      if (!fs.existsSync(filepath)) {
        recipesWithMissingFiles.push(recipe);
        console.log(`  Missing: ${recipe.imageUrl} (${recipe.title})${recipe.sourceUrl ? ` - Source: ${recipe.sourceUrl}` : ''}`);
      }
    }
  }
  console.log(`Missing local files: ${recipesWithMissingFiles.length}`);
  console.log(`Recipes with missing files that have sourceUrl: ${recipesWithMissingFiles.filter(r => r.sourceUrl).length}\n`);

  // Find recipes with empty/null imageUrls but have sourceUrl (imported recipes)
  const recipesWithoutImages = allRecipes.filter(r => 
    (!r.imageUrl || r.imageUrl === '') && r.sourceUrl
  );
  console.log(`Imported recipes without images: ${recipesWithoutImages.length}`);

  // Try to find source URLs from ImportJob table for recipes with missing files
  console.log('\nChecking ImportJob table for original URLs...');
  const importJobs = await prisma.importJob.findMany({
    where: {
      status: 'completed'
    },
    select: {
      id: true,
      url: true,
      result: true,
    }
  });
  console.log(`Found ${importJobs.length} completed import jobs`);

  // Create a map of imageUrl hash to source URL from import jobs
  const hashToSourceUrl = new Map<string, string>();
  for (const job of importJobs) {
    if (job.result && typeof job.result === 'object' && 'imageUrl' in job.result) {
      const imageUrl = (job.result as any).imageUrl;
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        // Generate hash from the image URL (same as downloadAndSaveImage does)
        const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
        hashToSourceUrl.set(hash, imageUrl);
      }
    }
  }
  console.log(`Mapped ${hashToSourceUrl.size} image URLs from import jobs\n`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  // Process recipes with external URLs
  for (const recipe of recipes) {
    if (!recipe.imageUrl) {
      skipCount++;
      continue;
    }

    console.log(`\n[${successCount + failCount + skipCount + 1}/${recipes.length}] ${recipe.title}`);
    console.log(`  Current URL: ${recipe.imageUrl}`);

    try {
      const localUrl = await downloadAndSaveImage(recipe.imageUrl);
      
      if (localUrl && localUrl.startsWith('/uploads/')) {
        // Update recipe
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageUrl: localUrl }
        });

        // Also update all versions with the same external URL
        await prisma.recipeVersion.updateMany({
          where: {
            recipeId: recipe.id,
            imageUrl: recipe.imageUrl
          },
          data: { imageUrl: localUrl }
        });

        successCount++;
        console.log(`  ✓ Updated to: ${localUrl}`);
      } else {
        failCount++;
        console.log(`  ✗ Download failed or returned empty`);
      }
    } catch (error) {
      failCount++;
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Small delay to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Also check RecipeVersion table for external URLs
  console.log('\n\nFinding recipe versions with external image URLs...\n');
  
  const versions = await prisma.recipeVersion.findMany({
    where: {
      imageUrl: {
        startsWith: 'http'
      }
    },
    include: {
      recipe: {
        select: {
          title: true,
        }
      }
    }
  });

  console.log(`Found ${versions.length} recipe versions with external image URLs\n`);

  for (const version of versions) {
    if (!version.imageUrl) {
      skipCount++;
      continue;
    }

    console.log(`\nVersion: ${version.title} (Recipe: ${version.recipe.title})`);
    console.log(`  Current URL: ${version.imageUrl}`);

    try {
      const localUrl = await downloadAndSaveImage(version.imageUrl);
      
      if (localUrl && localUrl.startsWith('/uploads/')) {
        await prisma.recipeVersion.update({
          where: { id: version.id },
          data: { imageUrl: localUrl }
        });

        successCount++;
        console.log(`  ✓ Updated to: ${localUrl}`);
      } else {
        failCount++;
        console.log(`  ✗ Download failed or returned empty`);
      }
    } catch (error) {
      failCount++;
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Process recipes with missing files - try to re-download directly if we have the original URL
  if (recipesWithMissingFiles.length > 0) {
    console.log(`\n\nTrying to re-download images for ${recipesWithMissingFiles.length} recipes with missing files...\n`);
    
    for (const recipe of recipesWithMissingFiles) {
      if (!recipe.imageUrl) {
        skipCount++;
        continue;
      }

      // Extract hash from filename (format: recipe-{hash}.{ext})
      const match = recipe.imageUrl.match(/recipe-([a-f0-9]+)\./);
      let originalImageUrl: string | undefined;

      if (match && hashToSourceUrl.has(match[1])) {
        originalImageUrl = hashToSourceUrl.get(match[1]);
        console.log(`\n[${successCount + failCount + skipCount + 1}/${recipesWithMissingFiles.length}] ${recipe.title}`);
        console.log(`  Found original image URL from import job`);
        console.log(`  Original URL: ${originalImageUrl}`);
      } else if (recipe.sourceUrl) {
        // Try to re-fetch from AI service
        console.log(`\n[${successCount + failCount + skipCount + 1}/${recipesWithMissingFiles.length}] ${recipe.title}`);
        console.log(`  Source URL: ${recipe.sourceUrl}`);
        console.log(`  Current imageUrl: ${recipe.imageUrl}`);

        try {
          const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
          const apiKey = process.env.AI_SERVICE_API_KEY;
          const headers: any = { 'Content-Type': 'application/json' };
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          
          const response = await axios.post(`${aiServiceUrl}/recipe/import`, 
            { url: recipe.sourceUrl },
            { headers }
          );

          if (response.status === 200) {
            const data = response.data;
            if (data.imageUrl && data.imageUrl.startsWith('http')) {
              originalImageUrl = data.imageUrl;
              console.log(`  Found image URL from AI service: ${originalImageUrl}`);
            } else {
              failCount++;
              console.log(`  ✗ No image URL found in import response`);
              continue;
            }
          } else {
            failCount++;
            console.log(`  ✗ Failed to fetch from AI service: HTTP ${response.status}`);
            continue;
          }
        } catch (axiosError: any) {
          failCount++;
          if (axiosError.response) {
            console.log(`  ✗ Failed to fetch from AI service: HTTP ${axiosError.response.status}`);
          } else {
            console.log(`  ✗ Error: ${axiosError.message || String(axiosError)}`);
          }
          continue;
        }
      } else {
        skipCount++;
        console.log(`\n[${successCount + failCount + skipCount}/${recipesWithMissingFiles.length}] ${recipe.title} - No source URL available, skipping`);
        continue;
      }

      // Download the image
      if (originalImageUrl) {
        try {
          const localUrl = await downloadAndSaveImage(originalImageUrl);
          
          if (localUrl && localUrl.startsWith('/uploads/')) {
            await prisma.recipe.update({
              where: { id: recipe.id },
              data: { imageUrl: localUrl }
            });

            await prisma.recipeVersion.updateMany({
              where: {
                recipeId: recipe.id,
                imageUrl: recipe.imageUrl
              },
              data: { imageUrl: localUrl }
            });

            successCount++;
            console.log(`  ✓ Updated to: ${localUrl}`);
          } else {
            failCount++;
            console.log(`  ✗ Download failed`);
          }
        } catch (error) {
          failCount++;
          console.log(`  ✗ Download error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between requests
    }
  }

  // Process recipes without images but with sourceUrl
  if (recipesWithoutImages.length > 0) {
    console.log(`\n\nTrying to re-fetch images from source URLs for ${recipesWithoutImages.length} recipes without images...\n`);
    
    for (const recipe of recipesWithoutImages) {
      if (!recipe.sourceUrl) {
        skipCount++;
        continue;
      }

      console.log(`\n[${successCount + failCount + skipCount + 1}/${recipesWithoutImages.length}] ${recipe.title}`);
      console.log(`  Source URL: ${recipe.sourceUrl}`);

      try {
        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const headers: any = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const response = await axios.post(`${aiServiceUrl}/recipe/import`, 
          { url: recipe.sourceUrl },
          { headers }
        );

        if (response.status === 200) {
          const data = response.data;
          if (data.imageUrl && data.imageUrl.startsWith('http')) {
            const localUrl = await downloadAndSaveImage(data.imageUrl);
            
            if (localUrl && localUrl.startsWith('/uploads/')) {
              await prisma.recipe.update({
                where: { id: recipe.id },
                data: { imageUrl: localUrl }
              });

              await prisma.recipeVersion.updateMany({
                where: {
                  recipeId: recipe.id,
                  imageUrl: recipe.imageUrl || ''
                },
                data: { imageUrl: localUrl }
              });

              successCount++;
              console.log(`  ✓ Updated to: ${localUrl}`);
            } else {
              failCount++;
              console.log(`  ✗ Download failed`);
            }
          } else {
            failCount++;
            console.log(`  ✗ No image URL found in import response`);
          }
        } else {
          failCount++;
          console.log(`  ✗ Failed to fetch from AI service: HTTP ${response.status}`);
        }
      } catch (axiosError: any) {
        failCount++;
        if (axiosError.response) {
          console.log(`  ✗ Failed to fetch from AI service: HTTP ${axiosError.response.status}`);
        } else {
          console.log(`  ✗ Error: ${axiosError.message || String(axiosError)}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n\n=== Summary ===');
  console.log(`Successfully downloaded: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Total processed: ${recipes.length + versions.length + recipesWithoutImages.length}`);
}

redownloadRecipeImages()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
