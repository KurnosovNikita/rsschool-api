import { INTERNAL_SERVER_ERROR, OK, NOT_FOUND } from 'http-status-codes';
import { connection, STATES, Types } from 'mongoose';
import * as Router from 'koa-router';
import { setResponse } from '../utils';

import {
    IApiResponse,
    IEventModel,
    TaskModel,
    SessionModel,
    IUserSession,
    AssignmentModel,
    AssignmentStatus,
    ICourseStudent,
    CourseStudentModel,
} from '../../models';

export const createPostEventsRoute = async (ctx: Router.IRouterContext) => {
    try {
        const userSession: IUserSession = ctx.state.user!;
        switch (ctx.request.body.type) {
            case 'task': {
                const event = new TaskModel({
                    ...ctx.request.body,
                    author: userSession._id,
                });
                ctx.body = {};
                ctx.body = await event.save();
                ctx.status = OK;
                const students: ICourseStudent[] = await getStudentsByCourseId(ctx.request.body.courseId);
                for (const index in students) {
                    if (students[index]) {
                        const student: ICourseStudent = students[index];
                        const assignment = new AssignmentModel({
                            courseId: ctx.request.body.courseId,
                            deadlineDate: event.endDateTime,
                            mentorId: student.mentors,
                            status: AssignmentStatus.Assigned,
                            studentId: student.userId,
                            taskId: event.id,
                        });
                        await assignment.save();
                    }
                }
                break;
            }
            case 'session': {
                const event = new SessionModel(ctx.request.body);
                ctx.body = await event.save();
                ctx.status = OK;
                break;
            }
            default:
                return;
        }
    } catch (e) {
        ctx.status = INTERNAL_SERVER_ERROR;
        ctx.logger.error(e, 'Failed to save document');
    }
};

export const createDeleteEventsRoute = async (ctx: Router.IRouterContext) => {
    const { id } = ctx.params;

    try {
        let query = await SessionModel.findByIdAndRemove(id);

        if (query === null) {
            query = await TaskModel.findByIdAndRemove(id);
            if (query !== null) {
                await AssignmentModel.remove({ taskId: id });
            } else {
                setResponse(ctx, NOT_FOUND);
                return;
            }
        }

        setResponse(ctx, OK);
    } catch (e) {
        ctx.status = INTERNAL_SERVER_ERROR;
        ctx.logger.error(e, 'Failed to remove document');
    }
};

export const createPatchEventsRoute = async (ctx: Router.IRouterContext) => {
    const { _id, ...body } = ctx.request.body;

    try {
        const result =
            (await SessionModel.findByIdAndUpdate(_id, body, { new: true })) ||
            (await TaskModel.findByIdAndUpdate(_id, body, { new: true }));

        if (result === null) {
            setResponse(ctx, NOT_FOUND);
            return;
        }

        setResponse(ctx, OK, result);
    } catch (e) {
        ctx.status = INTERNAL_SERVER_ERROR;
        ctx.logger.error(e, 'Failed to update document');
    }
};

export const createGetEventsRoute = async (ctx: Router.IRouterContext) => {
    const options: { useObjectId: boolean } = { useObjectId: true };
    try {
        if (connection.readyState !== STATES.connected) {
            ctx.status = INTERNAL_SERVER_ERROR;
            return;
        }
        const data =
            (await SessionModel.findById(options.useObjectId ? Types.ObjectId(ctx.params.id) : ctx.params.id).exec()) ||
            (await TaskModel.findById(options.useObjectId ? Types.ObjectId(ctx.params.id) : ctx.params.id).exec());
        if (data === null) {
            ctx.body = {};
            ctx.status = NOT_FOUND;
            return;
        }
        const body: IApiResponse<IEventModel> = {
            data,
        };
        ctx.body = body;
        ctx.status = OK;
    } catch (err) {
        ctx.logger.error(err);
        ctx.status = INTERNAL_SERVER_ERROR;
    }
};

const getStudentsByCourseId = async (courseId: string) => {
    const result: ICourseStudent[] = await CourseStudentModel.aggregate([
        {
            $match: {
                courseId,
            },
        },
        {
            $lookup: {
                as: 'user',
                foreignField: '_id',
                from: 'users',
                localField: 'userId',
            },
        },
        {
            $lookup: {
                as: 'mentors',
                foreignField: '_id',
                from: 'users',
                localField: 'mentors._id',
            },
        },
        { $unwind: '$user' },
    ]).exec();
    return result;
};
