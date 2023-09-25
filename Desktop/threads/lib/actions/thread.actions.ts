
"use server";

import { revalidatePath } from "next/cache";
import  User  from "../models/user.model";
import Thread from "../models/thread.model";
import { connectToDB } from "../mongoose";

interface Params {
    text: string,
    author: string,
    communityId: string | null,
    path: string,
}


// THISIS  ACTION IS USED FOR CREATING THREAD POSTS.

export async function createThread({
    text, author, communityId, path
}: Params) {
    connectToDB();

    const createdThread = await Thread.create({
        text,
        author,
        community: null,
    });

    //update user model
    await User.findByIdAndUpdate(author, {
        $push: { threads: createdThread._id}
    })

    revalidatePath(path)
};

//THIS ACTION IS FOR FETCHING POSTS

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
    connectToDB();

    //FOR CALCULATING NUMBER OF POSTS TO SKIP AND PAGINATION
    const skipAmount = (pageNumber - 1) * pageSize; 


    //FORFETCHING POSTS THAT ARE MAIN POSTS AND NOT COMMENTS
    const postsQuery = Thread.find({ parentId: { $in: [null, undefined]}})
    .sort({ createdAt: 'desc'})
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: 'author', model: 'User'})
    .populate({ 
        path: 'children',
        populate: {
            path: 'author',
            model: User,
            select: "_id name parentId image"
        }
    })

    const totalPostsCount = await Thread.countDocuments({parentId: { $in: [null, undefined]}})

    const posts = await postsQuery.exec();

    // FOR DETERMINING IF TOTAL AMOUNT OF POSTS  MEANS THERE ISA NEXT PAGE.
    const isNext = totalPostsCount > skipAmount + posts.length;

    return { posts, isNext}
}


//THIS IS TO FETCH THREAD BY ID
export async function fetchThreadById(id: string) {
    connectToDB();

    try {

        //TODO: POPULATE COMMUNITY 
        const thread = await Thread.findById(id)
        .populate({
            path: 'author',
            model: User,
            select: "_id id name image"
        })
        .populate({
            path: 'children',
            populate: [
                {
                    path: 'author',
                    model: User,
                    select: "_id id name parentId image"               
                 },
                 {
                    path: 'children',
                    model: Thread,
                    populate: {
                        path: 'author',
                        model: User,
                        select: "_id id name parentId image"
                    }
                 }
            ]
        }).exec();

        return thread;
    } catch (error: any) {
        throw new Error (`Error fetching thread: ${error.message}`)
    }
}


//THIS FUNCTIONALITY IS FOR ADDING COMMENTS.

export async function addCommentToThread(
    threadId: string,
    commentText: string,
    userId: string,
    path: string,
) {
    connectToDB();

    try {
        // FIND ORIGINAL THREAD BY ID

        const originalThread = await Thread.findById(threadId);

        if(!originalThread) {
            throw new Error("thread not found")
        }

        // CREATE A NEW THREAD WITH COMMENT TEXT

        const commentThread = new Thread({
            text: commentText,
            author: userId,
            parentId: threadId,
        })
        
        // FOR SAVING NEW THREAD

        const savedCommentThread = await commentThread.save()

        //Updatethe original thread to include new comment

        originalThread.children.push(savedCommentThread._id)

        //save the originalthread

        await originalThread.save();

        revalidatePath(path);

    } catch (error: any) {
        throw new Error(`Error adding comment to thread: ${error.message}`)
    }
}